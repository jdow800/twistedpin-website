import { useEffect, useMemo, useState } from "react";
import {
  correctCount,
  CorrectionStaleError,
  ForbiddenError,
  getCatalog,
  getZones,
  type BarSkuItem,
  type BarZoneItem,
  type CountCorrection,
  type CountDetail,
} from "./api";

// Correcting a liquor count after its report locked (TPRS 2026-10-03). On
// 10-02 the open rail Tanqueray was a liter saved as 1.2 of a 750, found by a
// recount after the lock, and the fix had to be a database edit nobody could
// see. An admin can now correct the latest full count with a reason. The count
// changes, so the next report opens on it; the locked grade and the order guide
// already sent do not, and the count says so for as long as it's on screen.

const amount = (n: number | null) => (n == null ? "none" : String(Number(n.toFixed(3))));
const when = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
};

/** What was corrected after the lock, oldest first. */
export function CorrectionHistory({ corrections }: { corrections: CountCorrection[] }) {
  if (corrections.length === 0) return null;
  return (
    <div className="lq-pw-row" style={{ border: "1px solid rgba(230,180,60,0.5)", borderRadius: 6, padding: "8px 10px" }}>
      <strong>Corrected after the report locked</strong>
      {corrections.map((c, i) => (
        <div key={i} className="lq-pw-sub" style={{ marginTop: 6 }}>
          <div className="lq-muted" style={{ fontSize: 12 }}>
            {c.retrospective && c.correctedAt
              ? `${when(c.correctedAt)} (recorded ${when(c.at)})`
              : when(c.at)}
            {c.by ? ` · ${c.by}` : ""}: {c.reason}
          </div>
          {c.changes.map((ch, j) => (
            <div key={j} style={{ fontSize: 13 }}>
              {ch.sku_name} · {ch.zone_name}: {amount(ch.before)} → {amount(ch.after)}
            </div>
          ))}
        </div>
      ))}
      <div className="lq-pw-sub lq-muted" style={{ fontSize: 12, marginTop: 6 }}>
        The locked grade and the order guide already sent stay as they were. The next report opens on the corrected count.
      </div>
    </div>
  );
}

type Row = { zoneId: string; zoneName: string; skuId: string; skuName: string; before: number | null; value: string; removed: boolean };

/** The admin's correction: change a quantity, add a bottle on a shelf, or take a line out. */
export function CorrectionEditor({ detail, onSaved, onCancel }: {
  detail: CountDetail;
  onSaved: () => Promise<void>;
  onCancel: () => void;
}) {
  const [rows, setRows] = useState<Row[]>(() => detail.lines.map((l) => ({
    zoneId: l.zoneId, zoneName: l.zoneName ?? "—", skuId: l.skuId, skuName: l.skuName ?? "—",
    before: Number(l.qtyUnits), value: String(Number(Number(l.qtyUnits).toFixed(3))), removed: false,
  })));
  const [reason, setReason] = useState("");
  const [catalog, setCatalog] = useState<BarSkuItem[]>([]);
  const [zones, setZones] = useState<BarZoneItem[]>([]);
  const [search, setSearch] = useState("");
  const [pick, setPick] = useState<BarSkuItem | null>(null);
  const [zoneId, setZoneId] = useState("");
  const [qty, setQty] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    void Promise.all([getCatalog("bar"), getZones("bar")]).then(([c, z]) => {
      if (!live) return;
      setCatalog(c);
      setZones(z);
      setZoneId((cur) => cur || z[0]?.id || "");
    }).catch(() => { if (live) setErr("Couldn't load the bottles and shelves to add from."); });
    return () => { live = false; };
  }, []);

  const hits = useMemo(() => {
    const t = search.trim().toLowerCase();
    return t.length < 2 || pick ? [] : catalog.filter((s) => s.name.toLowerCase().includes(t)).slice(0, 6);
  }, [search, catalog, pick]);

  const changes = rows.flatMap((r) => {
    const after = r.removed ? null : r.value.trim() === "" ? undefined : Number(r.value);
    if (after === undefined || (after != null && (!Number.isFinite(after) || after < 0))) return [];
    const same = after == null ? r.before == null : r.before != null && Math.abs(after - r.before) < 1e-9;
    return same ? [] : [{ zoneId: r.zoneId, skuId: r.skuId, before: r.before, after }];
  });
  const invalid = rows.some((r) => !r.removed && (r.value.trim() === "" || !Number.isFinite(Number(r.value)) || Number(r.value) < 0));

  function addBottle() {
    if (!pick || !zoneId) return;
    const n = Number(qty);
    if (qty.trim() === "" || !Number.isFinite(n) || n < 0) {
      setErr("Enter how many for the bottle you're adding.");
      return;
    }
    const zoneName = zones.find((z) => z.id === zoneId)?.name ?? "—";
    setErr(null);
    setRows((cur) => {
      const at = cur.findIndex((r) => r.zoneId === zoneId && r.skuId === pick.id);
      if (at >= 0) return cur.map((r, i) => (i === at ? { ...r, value: String(n), removed: false } : r));
      return [...cur, { zoneId, zoneName, skuId: pick.id, skuName: pick.name, before: null, value: String(n), removed: false }];
    });
    setPick(null);
    setSearch("");
    setQty("");
  }

  async function save() {
    if (changes.length === 0 || reason.trim().length < 3 || invalid) return;
    setSaving(true);
    setErr(null);
    try {
      await correctCount(detail.session.id, reason.trim(), changes);
      await onSaved();
    } catch (e) {
      setErr(e instanceof CorrectionStaleError
        ? "This count changed since you opened it. Close this, reopen the count and check the numbers again."
        : e instanceof ForbiddenError
          ? "Only an admin can correct a locked count."
          : e instanceof Error && /newer full count/.test(e.message)
            ? e.message
            : "Couldn't save the correction. Try again.");
      setSaving(false);
    }
  }

  return (
    <div className="lq-pw-row lq-correct">
      <strong>Correct this count</strong>
      <div className="lq-pw-sub lq-muted" style={{ fontSize: 12 }}>
        The report is locked, so its grade and the order guide already sent won't change. The next report opens on what you save here.
      </div>
      {rows.map((r, i) => {
        const changed = changes.some((c) => c.zoneId === r.zoneId && c.skuId === r.skuId);
        return (
          <div key={`${r.zoneId}:${r.skuId}`} className="lq-invd-line">
            <div className="lq-invd-line-main">
              <span className="lq-invd-desc" style={r.removed ? { textDecoration: "line-through" } : undefined}>
                {r.skuName} <span className="lq-muted">· {r.zoneName}{r.before == null ? " · new" : ""}</span>
              </span>
              <span style={{ whiteSpace: "nowrap" }}>
                <input
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step="any"
                  value={r.value}
                  disabled={r.removed}
                  aria-label={`${r.skuName} on ${r.zoneName}`}
                  onChange={(e) => setRows((cur) => cur.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))}
                  style={{ width: 72 }}
                />
                <button
                  type="button"
                  className="lq-linkbtn"
                  aria-label={r.removed ? `Keep ${r.skuName}` : `Take ${r.skuName} out`}
                  onClick={() => setRows((cur) => r.before == null
                    ? cur.filter((_, j) => j !== i)
                    : cur.map((x, j) => (j === i ? { ...x, removed: !x.removed } : x)))}
                >
                  {r.removed ? "keep" : "✕"}
                </button>
              </span>
            </div>
            {changed && (
              <div className="lq-pw-sub lq-muted" style={{ fontSize: 12 }}>
                {amount(r.before)} → {r.removed ? "none" : amount(Number(r.value))}
              </div>
            )}
          </div>
        );
      })}

      <div className="lq-pw-sub" style={{ marginTop: 8 }}>
        <strong style={{ fontSize: 13 }}>Add a bottle</strong>
        {pick ? (
          <div style={{ fontSize: 13 }}>
            {pick.name}{" "}
            <button type="button" className="lq-linkbtn" onClick={() => setPick(null)}>change</button>
          </div>
        ) : (
          <input type="search" placeholder="Search bottles" value={search} onChange={(e) => setSearch(e.target.value)}
            aria-label="Search bottles to add" />
        )}
        {hits.map((s) => (
          <button key={s.id} type="button" className="lq-linkbtn" onClick={() => { setPick(s); setSearch(s.name); }}>
            + {s.name}
          </button>
        ))}
        <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
          <select value={zoneId} onChange={(e) => setZoneId(e.target.value)} aria-label="Shelf for the added bottle">
            {zones.map((z) => <option key={z.id} value={z.id}>{z.name}</option>)}
          </select>
          <input type="number" inputMode="decimal" min={0} step="any" placeholder="how many" value={qty}
            onChange={(e) => setQty(e.target.value)} aria-label="How many of the added bottle" style={{ width: 90 }} />
          <button type="button" className="lq-btn lq-btn-ghost" disabled={!pick || !zoneId} onClick={addBottle}>Add</button>
        </div>
      </div>

      <label className="lq-pw-sub" style={{ display: "block", marginTop: 8 }}>
        <span style={{ fontSize: 13 }}>Why (required)</span>
        <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} style={{ width: "100%" }}
          placeholder="Recounted Tanqueray: the open rail bottle was a liter" />
      </label>
      {err && <p className="lq-error" style={{ fontSize: 13 }}>{err}</p>}
      <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
        <button type="button" className="lq-btn lq-btn-primary"
          disabled={saving || changes.length === 0 || reason.trim().length < 3 || invalid} onClick={() => void save()}>
          {saving ? "Saving…" : changes.length === 0 ? "Save correction" : `Save ${changes.length} correction${changes.length === 1 ? "" : "s"}`}
        </button>
        <button type="button" className="lq-btn lq-btn-ghost" disabled={saving} onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}
