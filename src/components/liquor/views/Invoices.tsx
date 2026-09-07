import { useEffect, useMemo, useState } from "react";
import {
  getInvoiceHistory,
  getInvoiceDetail,
  getCatalog,
  applyHeldCost,
  matchInvoiceLine,
  newSkuFromLine,
  reextractInvoice,
  clearInvoiceFlag,
  setInvoiceLineReceived,
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

// Deep-link auto-open (the flagged-invoice email's "Review invoice →" button lands
// on /liquor?invoice=<id>). Consumed once per page load so leaving the detail and
// coming back to Invoices later in the session shows the normal list.
let deepLinkConsumed = false;

export default function Invoices({
  onDone,
  initialInvoiceId = null,
}: {
  onDone: () => void;
  initialInvoiceId?: string | null;
}) {
  const [phase, setPhase] = useState<"loading" | "ready" | "error">("loading");
  const [list, setList] = useState<InvoiceSummary[]>([]);
  const [detail, setDetail] = useState<InvoiceDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [catalog, setCatalog] = useState<BarSkuItem[]>([]);
  const [reextracting, setReextracting] = useState(false);
  const [reextractMsg, setReextractMsg] = useState<string | null>(null);
  const [clearing, setClearing] = useState(false);
  const [clearMsg, setClearMsg] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const [inv, cat] = await Promise.all([getInvoiceHistory(), getCatalog().catch(() => [])]);
        if (live) {
          setList(inv);
          setCatalog(cat);
          setPhase("ready");
          if (initialInvoiceId && !deepLinkConsumed) {
            deepLinkConsumed = true;
            void open(initialInvoiceId); // bad/expired id: open() fails quietly, list stays
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

  // Apply a confirmed match to the open detail (line matched + review cleared;
  // flip the invoice to Confirmed when the server says nothing's left).
  //
  // The hold rides along: a match can land while its COST is withheld
  // (BUILD-SPEC 11.7c), and without threading it here the question would only
  // appear after a manual reload — which is exactly when nobody answers it.
  // Keep the LIST's held-count in step with the open detail. "All invoices"
  // just clears `detail` and re-renders the list from state, so without this a
  // resolved hold still reads "1 cost held" and a newly raised one shows no
  // badge at all — on the one surface whose entire job is finding them.
  function syncHeldCount(invoiceId: string, lines: InvoiceLine[]) {
    const held = lines.filter((l) => l.costHoldReason).length;
    setList((rows) => rows.map((r) => (r.id === invoiceId ? { ...r, heldCount: held } : r)));
  }

  function handleMatched(
    lineId: string,
    name: string,
    confirmed: boolean,
    hold?: { costHoldReason: string | null; matchedSkuId: string | null; matchedCountUnit: string | null },
  ) {
    setDetail((d) => {
      if (!d) return d;
      const lines = d.lines.map((x) =>
        x.id === lineId ? { ...x, matchedName: name, needsReview: false, ...(hold ?? {}) } : x,
      );
      syncHeldCount(d.invoice.id, lines);
      return { ...d, invoice: confirmed ? { ...d.invoice, status: "confirmed" } : d.invoice, lines };
    });
  }

  /** Clear a resolved hold in place, so the control disappears on Apply. */
  function handleCostApplied(lineId: string) {
    setDetail((d) => {
      if (!d) return d;
      const lines = d.lines.map((x) => (x.id === lineId ? { ...x, costHoldReason: null } : x));
      syncHeldCount(d.invoice.id, lines);
      return { ...d, lines };
    });
  }

  async function open(id: string) {
    setDetailLoading(true);
    setReextractMsg(null);
    setClearMsg(null);
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

  // Settle a count-flag that has nothing left to act on. Without this an invoice
  // flagged for handwriting or an order divergence, whose lines are all matched,
  // has NO available action — and a flagged invoice is excluded from the variance
  // purchase math, so the delivery silently vanishes from inventory.
  async function doClearFlag() {
    if (!detail || clearing) return;
    setClearing(true);
    setClearMsg(null);
    try {
      const r = await clearInvoiceFlag(detail.invoice.id);
      if (r.ok) {
        setDetail((d) => (d ? { ...d, invoice: { ...d.invoice, status: "confirmed" } } : d));
        getInvoiceHistory().then(setList).catch(() => {});
      } else {
        setClearMsg(
          r.error === "lines_need_match"
            ? "Match the bottles below first — those still need a home."
            : r.error === "duplicate"
              ? "This is a duplicate of an invoice already on file — it has to stay out of the count."
              : r.error === "not_flagged"
                ? "Already settled."
                : "Could not confirm — try again.",
        );
      }
    } catch {
      setClearMsg("Could not confirm — try again.");
    } finally {
      setClearing(false);
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

        {inv.status === "flagged" && !detail.lines.some((l) => l.needsReview) && (
          <div className="lq-invd-clear">
            <button type="button" className="lq-btn" disabled={clearing} onClick={doClearFlag}>
              {clearing ? "Confirming…" : "Counted it — confirm invoice"}
            </button>
            <span className="lq-muted lq-invd-clear-hint">
              {clearMsg ??
                "Every bottle is matched. Confirm once you have checked what actually arrived — until then this invoice is left out of your next variance report."}
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
                {l.sizeText && <span>· {l.sizeText}</span>}
                {l.qtyUnits && <span>· {Number(l.qtyUnits)} × {money(l.unitCost)}</span>}
              </div>
              {l.needsReview && l.lineType === "product" && (
                <MatchControl invoiceId={detail.invoice.id} line={l} catalog={catalog} onMatched={handleMatched} />
              )}
              {l.costHoldReason && (
                <CostHoldControl invoiceId={detail.invoice.id} line={l} onApplied={handleCostApplied} />
              )}
              {l.annotation && (
                <p className="lq-invd-annot">
                  ✍️ {l.annotation}
                  <span className="lq-invd-annot-hint">
                    — printed numbers were kept. Count the shelf and record what actually arrived.
                  </span>
                </p>
              )}
              {(l.lineType === "product" || l.lineType === "keg") && l.qtyUnits && (
                <ReceivedControl
                  invoiceId={detail.invoice.id}
                  line={l}
                  onChanged={(lineId, receivedQty) =>
                    setDetail((d) =>
                      !d
                        ? d
                        : {
                            ...d,
                            lines: d.lines.map((x) =>
                              x.id === lineId ? { ...x, receivedQty: receivedQty == null ? null : String(receivedQty) } : x,
                            ),
                          },
                    )
                  }
                />
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
              {/* A held cost deliberately does NOT change the invoice's status
                  (a 'flagged' invoice is dropped from variance purchases), so
                  the count is its own marker — and the only way to find one
                  until the shared ops inbox lands. */}
              {!!inv.heldCount && (
                <span className="lq-invrow-held">
                  {inv.heldCount} cost{inv.heldCount === 1 ? "" : "s"} held
                </span>
              )}
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

/**
 * "Cost held" — answers the unit question when the vendor billed in one unit
 * and we count in another (BUILD-SPEC 11.7c).
 *
 * The case this exists for: Sysco billed 1 LB of fresh mint at $8.34; it
 * matched `Mint (fresh)`, which is counted by the BUNCH, and the old code wrote
 * $8.34 straight onto the SKU. The match was right. The price was per pound.
 *
 * ⚠ THE INPUT IS DOLLARS PER COUNT UNIT, NOT "how many bunches in a pound".
 * A ratio would look more useful and would be a lie: the stored `unit_cost` has
 * already been rewritten by the nested-pack rule before it ever reaches this
 * screen, and a size token like Greco's "1/5#Bg" — a pack of FIVE pounds —
 * cannot be reduced to a bare unit without inventing a factor. Asking for the
 * dollar figure asks for the thing actually being authorised.
 *
 * ⚠ AND IT RESOLVES COST ONLY. The billed QUANTITY is untouched, because
 * stock-count usage reads it directly; the copy says so rather than letting
 * someone assume they have just fixed the count.
 *
 * Collapsed to a line of prose until tapped, like ReceivedControl — most lines
 * never hold, and a permanent input on each row would be noise.
 */
function CostHoldControl({
  invoiceId,
  line,
  onApplied,
}: {
  invoiceId: string;
  line: InvoiceLine;
  onApplied: (lineId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [val, setVal] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const unit = line.matchedCountUnit ?? "unit";
  const n = Number(val);
  // Two decimals, matching the server. Without the precision test the API
  // rejects 1.005 and the counter learns that only after tapping — and the
  // alternative, rounding it here, is the silent money disagreement this
  // whole feature exists to prevent. The epsilon is for binary floats
  // (2.09 * 100 === 208.99999999999997).
  const valid =
    val.trim() !== "" &&
    Number.isFinite(n) &&
    n > 0 &&
    Math.abs(n * 100 - Math.round(n * 100)) < 1e-9;

  async function save() {
    if (!line.matchedSkuId) return;
    setBusy(true);
    setErr(null);
    try {
      await applyHeldCost(invoiceId, line.id, line.matchedSkuId, n);
      onApplied(line.id);
    } catch {
      // The hold stays put on failure — the question is unanswered until the
      // server says otherwise.
      setErr("Didn't save — try again.");
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <div className="lq-invd-hold">
        <span className="lq-invd-hold-flag">Cost held — {line.costHoldReason}</span>
        <button type="button" className="lq-linkbtn" onClick={() => setOpen(true)}>
          set the cost
        </button>
      </div>
    );
  }

  return (
    <div className="lq-invd-hold lq-invd-hold-edit">
      <span className="lq-invd-hold-flag">Cost held — {line.costHoldReason}</span>
      <p className="lq-invd-hold-q">
        This line was billed {line.sizeText ? `as ${line.sizeText}` : "in another unit"} at{" "}
        {money(line.unitCost)}. What does one {unit} cost?
      </p>
      <label>
        $
        <input
          type="number"
          inputMode="decimal"
          min={0}
          step="0.01"
          value={val}
          autoFocus
          onChange={(e) => setVal(e.target.value)}
          placeholder="0.00"
        />
        <span className="lq-muted">per {unit}</span>
      </label>
      <p className="lq-invd-hold-note lq-muted">
        Sets the cost only — the billed quantity stays as it is.
      </p>
      <div className="lq-invd-recvd-actions">
        <button type="button" className="lq-btn" disabled={busy || !valid} onClick={() => void save()}>
          {busy ? "Saving…" : "Use this cost"}
        </button>
        <button
          type="button"
          className="lq-linkbtn"
          disabled={busy}
          onClick={() => {
            setOpen(false);
            setErr(null);
          }}
        >
          cancel
        </button>
      </div>
      {err && <p className="lq-invd-recvd-err">{err}</p>}
    </div>
  );
}

/**
 * "Came up short?" — records what actually came off the truck.
 *
 * Collapsed to a single link until used, because the overwhelming majority of
 * lines arrive complete and a box on every row would be noise. The value is
 * NEVER pre-filled with the billed quantity: a delivery someone checked and a
 * delivery nobody looked at have to stay distinguishable, and pre-filling makes
 * them identical.
 *
 * Why it matters more than the credit it surfaces: purchases feed the variance
 * grade as used = start + purchased − end, so stock billed but never delivered
 * shows up at the next count as consumption with no sales behind it — which
 * reads exactly like theft. Breakthru #128349267 billed 3 bottles of Carpano Dry
 * and delivered none.
 */
function ReceivedControl({
  invoiceId,
  line,
  onChanged,
}: {
  invoiceId: string;
  line: InvoiceLine;
  onChanged: (lineId: string, receivedQty: number | null) => void;
}) {
  const billed = Number(line.qtyUnits);
  const recorded = line.receivedQty == null ? null : Number(line.receivedQty);
  // Someone wrote on this row and nobody has recorded a count yet — open the box
  // rather than making them find it. The alert told them to count; landing on a
  // collapsed link would ask them to go looking for where to put the answer.
  const [open, setOpen] = useState(() => Boolean(line.annotation) && recorded == null);
  const [val, setVal] = useState(recorded == null ? "" : String(recorded));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function save(next: number | null) {
    setBusy(true);
    setErr(null);
    try {
      await setInvoiceLineReceived(invoiceId, line.id, next);
      onChanged(line.id, next);
      setOpen(false);
    } catch {
      setErr("Didn't save — try again.");
    } finally {
      setBusy(false);
    }
  }

  // Settled state: a discrepancy is on file. Show it with the money it's worth,
  // since that is the number someone has to take to the rep.
  if (recorded != null && !open) {
    const shortBy = billed - recorded;
    const unit = line.unitCost == null ? null : Number(line.unitCost);
    const credit = shortBy > 0 && unit != null ? shortBy * unit : null;
    return (
      <div className="lq-invd-recvd">
        <span className="lq-invd-recvd-flag">
          {shortBy > 0
            ? `Short ${+shortBy.toFixed(3)} of ${billed}`
            : shortBy < 0
              ? `Over by ${+Math.abs(shortBy).toFixed(3)}`
              : `Confirmed all ${billed}`}
        </span>
        {credit != null && <span className="lq-invd-recvd-credit">credit due {money(credit.toFixed(2))}</span>}
        <button type="button" className="lq-linkbtn" disabled={busy} onClick={() => { setVal(String(recorded)); setOpen(true); }}>
          change
        </button>
      </div>
    );
  }

  if (!open) {
    return (
      <div className="lq-invd-recvd">
        <button type="button" className="lq-linkbtn lq-muted" onClick={() => setOpen(true)}>
          Came up short?
        </button>
      </div>
    );
  }

  return (
    <div className="lq-invd-recvd lq-invd-recvd-edit">
      <label>
        Actually received
        <input
          type="number"
          inputMode="decimal"
          min={0}
          step="any"
          value={val}
          autoFocus
          onChange={(e) => setVal(e.target.value)}
          placeholder={String(billed)}
        />
        <span className="lq-muted">of {billed} billed</span>
      </label>
      <div className="lq-invd-recvd-actions">
        <button
          type="button"
          className="lq-btn"
          disabled={busy || val.trim() === "" || !Number.isFinite(Number(val)) || Number(val) < 0}
          onClick={() => void save(Number(val))}
        >
          {busy ? "Saving…" : "Save"}
        </button>
        {recorded != null && (
          <button type="button" className="lq-linkbtn" disabled={busy} onClick={() => void save(null)}>
            clear
          </button>
        )}
        <button type="button" className="lq-linkbtn" disabled={busy} onClick={() => { setOpen(false); setErr(null); }}>
          cancel
        </button>
      </div>
      {err && <p className="lq-invd-recvd-err">{err}</p>}
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
  onMatched: (
    lineId: string,
    name: string,
    confirmed: boolean,
    hold?: { costHoldReason: string | null; matchedSkuId: string | null; matchedCountUnit: string | null },
  ) => void;
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
      onMatched(line.id, r.matchedName || name, r.invoiceConfirmed, {
        costHoldReason: r.costHeld,
        matchedSkuId: r.matchedSkuId,
        matchedCountUnit: r.matchedCountUnit,
      });
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
      onMatched(line.id, r.matchedName, r.invoiceConfirmed, {
        costHoldReason: r.costHeld,
        matchedSkuId: r.skuId,
        // From the SERVER, never inferred from sizeMl: find-or-create may have
        // landed on an existing SKU counted by the case or the pound, and this
        // string is what the cost prompt puts after "what does one ___ cost?".
        // Guessing it would silently redefine the money being authorised.
        matchedCountUnit: r.countUnit,
      });
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
