import type { VarianceFamily, VarianceLine } from "./api";

// The variance report's "All bottles" list, one row per PRODUCT. Jon buys a
// product in 750 ml or 1 L, whichever is cheaper per ounce, so a recipe pours
// off one size while the purchases land on the other: per size, the 9/18–10/2
// Tanqueray read as a $33 gain and a $36 loss, about $3 of real loss between
// them. TPRS grades the sizes as one product (variance.ts sizeFamilies), and
// this list shows it the same way: one row at the product's one price per
// ounce, its sizes as counted underneath. Per-size dollars are left off on
// purpose: they are the artifact the product row replaces.

export interface VarianceRow {
  line: VarianceLine;
  /** A product counted in more than one bottle size: each size, smallest first. */
  sizes: VarianceLine[];
}

/** Products, worst missing first. A report stored before families has none,
 *  so it reads exactly as it always did. */
export function varianceRows(lines: VarianceLine[], families: VarianceFamily[] = []): VarianceRow[] {
  if (families.length === 0) return lines.map((line) => ({ line, sizes: [] }));
  const bySku = new Map(lines.map((l) => [l.skuId, l]));
  const pooled = new Set(families.flatMap((f) => f.skuIds));
  const rows: VarianceRow[] = lines.filter((l) => !pooled.has(l.skuId)).map((line) => ({ line, sizes: [] }));
  for (const f of families) {
    rows.push({
      line: {
        skuId: `family:${f.key}`,
        name: f.name,
        sizeMl: f.sizes[0] ?? null,
        startOz: f.startOz,
        purchasedOz: f.purchasedOz,
        endOz: f.endOz,
        usedOz: f.usedOz,
        soldOz: f.soldOz,
        lossOz: f.lossOz,
        costPerOz: f.costPerOz,
        missingCost: f.missingCost,
        gradePct: f.gradePct,
        flags: f.flags,
        cleanForRollup: f.cleanForRollup,
      },
      sizes: f.skuIds.flatMap((id) => bySku.get(id) ?? []),
    });
  }
  return rows.sort((a, b) => (b.line.missingCost ?? -Infinity) - (a.line.missingCost ?? -Infinity));
}

const sizeLabel = (ml: number | null) => (ml == null ? "?" : ml >= 1000 ? `${ml / 1000} L` : `${ml} ml`);
/** Ounces back to bottles of this size, to two places: 21.5 oz of a 750 is 0.85. */
const bottles = (oz: number, ml: number | null) => (ml ? Number(((oz * 29.5735) / ml).toFixed(2)) : 0);

/** "750 ml · 0.85 → 1.35 bottles · used −12.7oz · sold 18.5oz" */
function sizeDetail(z: VarianceLine): string {
  const bought = bottles(z.purchasedOz, z.sizeMl);
  // A size's own negative usage is expected inside a product (the size the
  // shelf was counted under); what it is MISSING from is worth naming.
  const gaps = z.flags.filter((f) => f !== "negative_used");
  return (
    `${sizeLabel(z.sizeMl)} · ${bottles(z.startOz, z.sizeMl)}` +
    (bought > 0 ? ` + ${bought} in` : bought < 0 ? ` − ${-bought} returned` : "") +
    ` → ${bottles(z.endOz, z.sizeMl)} bottles · used ${z.usedOz}oz · sold ${z.soldOz}oz` +
    (gaps.length ? ` · ${gaps.join(", ")}` : "")
  );
}

export function VarianceLines({ lines, families }: { lines: VarianceLine[]; families?: VarianceFamily[] }) {
  return (
    <div style={{ marginTop: 8 }}>
      {varianceRows(lines, families).map(({ line: l, sizes }) => (
        <div key={l.skuId} className="lq-invd-line">
          <div className="lq-invd-line-main">
            <span className="lq-invd-desc">
              {l.name}
              {!l.cleanForRollup && <span className="lq-muted"> · {l.flags.join(", ")}</span>}
            </span>
            <span className="lq-invd-amt" style={{ whiteSpace: "nowrap" }}>
              {l.lossOz > 0 ? `−${l.lossOz}oz` : l.lossOz < 0 ? `+${-l.lossOz}oz` : "0oz"}
              {l.missingCost != null && (
                <span className={l.missingCost > 0 ? "lq-pw-up" : "lq-pw-down"}>
                  {" "}{l.missingCost > 0 ? `$${l.missingCost.toFixed(2)}` : `+$${(-l.missingCost).toFixed(2)}`}
                </span>
              )}
            </span>
          </div>
          <div className="lq-pw-sub lq-muted" style={{ fontSize: 12 }}>
            used {l.usedOz}oz · sold {l.soldOz}oz{l.gradePct != null ? ` · ${l.gradePct}%` : ""}
          </div>
          {sizes.map((z) => (
            <div key={z.skuId} className="lq-pw-sub lq-muted" style={{ fontSize: 12, paddingLeft: 12 }}>
              {sizeDetail(z)}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
