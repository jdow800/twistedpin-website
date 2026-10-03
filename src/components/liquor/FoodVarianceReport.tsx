import type {
  FoodVarianceBasis,
  FoodVarianceFlag,
  FoodVarianceLine,
  FoodVarianceReportBody,
} from "./api";

// One food count's variance report as TPRS stored it (migration 0202; Opsi
// BUILD-SPEC 11.121): per ingredient, what the kitchen used between two food
// counts against what the recipes say the bracket's sales and catering used.
// Clean lines come first, ranked by dollars; a flagged line is left out of
// every total and says why. Tap a line for the dishes behind it. Pure: the
// screen (views/FoodVariance.tsx) loads the report and picks the version.

/** Why a line is left out of the totals, in plain words. */
export const FLAG_TEXT: Record<FoodVarianceFlag, string> = {
  not_in_start: "not in the opening count",
  not_in_end: "not in the closing count",
  unit_unrecorded: "a count didn't record its unit",
  unit_changed: "counted in a different unit at each end",
  package_changed: "the case size changed",
  recipe_unit_mismatch: "the recipe's unit doesn't convert",
  no_yield: "no yield yet",
  no_cost: "no cost yet",
  negative_used: "more at the end than the start plus deliveries",
  negative_theoretical: "more voided than sold",
  purchase_unconverted: "a delivery couldn't be converted",
};

const BAND_TEXT = { normal: "Normal", watch: "Watch", look: "Look" } as const;

/** Up to two decimals, trailing zeros dropped: 6.5, 3, 0.25. */
export const num = (n: number) => String(Number(n.toFixed(2)));

/** "$1,234.56", no sign. */
export const usd = (n: number) =>
  `$${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** A count unit for a quantity: "bag" for 1, "bags" for 6. Abbreviations and
 *  "each" stay as they are. */
export function unitWord(unit: string, n: number): string {
  if (Math.abs(n) === 1 || ["each", "lb", "gal", "oz", "bib"].includes(unit) || unit.endsWith("s")) return unit;
  return /(x|ch|sh)$/.test(unit) ? `${unit}es` : `${unit}s`;
}

/** "6 bags", or a bare "6" when the report didn't say what it was counted in. */
export const amount = (n: number, unit?: string | null) => (unit ? `${num(n)} ${unitWord(unit, n)}` : num(n));

/** Variance dollars in words: more used than the recipes say is "over". */
export function overUnder(dollars: number): { text: string; className: string } {
  if (Math.abs(dollars) < 0.005) return { text: "even", className: "lq-muted" };
  return dollars > 0
    ? { text: `${usd(dollars)} over`, className: "lq-pw-up" }
    : { text: `${usd(dollars)} under`, className: "lq-pw-down" };
}

const signed = (n: number, digits = 2) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${String(Number(Math.abs(n).toFixed(digits)))}`;

// ── what changed between two versions ─────────────────────────────────────

type Pair<T> = [T, T];
export interface FoodLineChange {
  skuId: string;
  name: string;
  unit: string | null;
  theoretical: Pair<number | null>;
  varianceDollars: Pair<number | null>;
  yieldUsed: Pair<number | null>;
  clean: Pair<boolean | null>;
}
export interface FoodVersionChanges {
  net: Pair<number>;
  mappedSalesPct: Pair<number | null>;
  recipesChanged: boolean;
  /** Lines whose theoretical, dollars, yield or standing moved, biggest dollar move first. */
  lines: FoodLineChange[];
}

const same = (a: number | null, b: number | null) => (a == null || b == null ? a === b : Math.abs(a - b) < 1e-9);

/** What a later version changed against an earlier one: a re-run is a
 *  recipe, yield or supplier correction, so this is what the correction did. */
export function versionChanges(
  from: { report: FoodVarianceReportBody; basis: FoodVarianceBasis | null },
  to: { report: FoodVarianceReportBody; basis: FoodVarianceBasis | null },
): FoodVersionChanges {
  const before = new Map(from.report.lines.map((l) => [l.skuId, l]));
  const after = new Map(to.report.lines.map((l) => [l.skuId, l]));
  const lines: FoodLineChange[] = [];
  for (const skuId of new Set([...before.keys(), ...after.keys()])) {
    const a = before.get(skuId);
    const b = after.get(skuId);
    const change: FoodLineChange = {
      skuId,
      name: (b ?? a)!.name,
      unit: b?.unit ?? a?.unit ?? null,
      theoretical: [a?.theoretical ?? null, b?.theoretical ?? null],
      varianceDollars: [a?.varianceDollars ?? null, b?.varianceDollars ?? null],
      yieldUsed: [a?.yieldUsed ?? null, b?.yieldUsed ?? null],
      clean: [a ? a.clean : null, b ? b.clean : null],
    };
    const moved =
      !same(...change.theoretical) || !same(...change.varianceDollars) || !same(...change.yieldUsed) || change.clean[0] !== change.clean[1];
    if (moved) lines.push(change);
  }
  const move = (c: FoodLineChange) => Math.abs((c.varianceDollars[1] ?? 0) - (c.varianceDollars[0] ?? 0));
  lines.sort((x, y) => move(y) - move(x));
  return {
    net: [from.report.totals.netVarianceDollars, to.report.totals.netVarianceDollars],
    mappedSalesPct: [from.report.completeness.mappedSalesPct, to.report.completeness.mappedSalesPct],
    recipesChanged: (from.basis?.recipes.md5 ?? null) !== (to.basis?.recipes.md5 ?? null),
    lines,
  };
}

const dollarsWord = (d: number | null) => (d == null ? "no dollars" : overUnder(d).text);

function ChangeList({ changes }: { changes: FoodVersionChanges }) {
  const netMoved = !same(...changes.net);
  return (
    <div className="lq-pw-row lq-fv-changes">
      <div className="lq-fv-section-title">What changed from the original</div>
      <div className="lq-pw-sub">
        {netMoved ? `Net ${dollarsWord(changes.net[0])} → ${dollarsWord(changes.net[1])}` : `Net unchanged at ${dollarsWord(changes.net[1])}`}
        {!same(...changes.mappedSalesPct) && ` · sales with a recipe ${changes.mappedSalesPct[0] ?? "—"}% → ${changes.mappedSalesPct[1] ?? "—"}%`}
        {changes.recipesChanged && " · recipes changed"}
      </div>
      {changes.lines.length === 0 ? (
        <div className="lq-pw-sub lq-muted">No ingredient moved.</div>
      ) : (
        changes.lines.map((c) => {
          const parts: string[] = [];
          if (!same(...c.theoretical)) {
            const [a, b] = c.theoretical;
            parts.push(`recipes say ${a == null ? "—" : num(a)} → ${b == null ? "—" : amount(b, c.unit)}`);
          }
          if (!same(...c.yieldUsed)) parts.push(`yield ${c.yieldUsed[0] ?? "none"} → ${c.yieldUsed[1] ?? "none"}`);
          if (!same(...c.varianceDollars)) parts.push(`${dollarsWord(c.varianceDollars[0])} → ${dollarsWord(c.varianceDollars[1])}`);
          if (c.clean[0] !== c.clean[1]) {
            parts.push(c.clean[1] == null ? "no longer graded" : c.clean[0] == null ? "newly graded" : c.clean[1] ? "now in the totals" : "now left out");
          }
          return (
            <div key={c.skuId} className="lq-pw-sub lq-fv-change">
              <strong>{c.name}</strong>: {parts.join(" · ")}
            </div>
          );
        })
      )}
    </div>
  );
}

// ── the report ────────────────────────────────────────────────────────────

/** "10 + 2 in → 4 on the shelf" */
function movement(l: FoodVarianceLine): string {
  const start = l.start == null ? "not counted" : num(l.start);
  const end = l.end == null ? "not counted" : amount(l.end, l.unit);
  const bought = l.purchased > 0 ? ` + ${num(l.purchased)} in` : l.purchased < 0 ? ` − ${num(-l.purchased)} returned` : "";
  return `${start}${bought} → ${end}`;
}

function LineRow({ l }: { l: FoodVarianceLine }) {
  const dollars = l.varianceDollars != null ? overUnder(l.varianceDollars) : null;
  const unitLabel = l.unit ? unitWord(l.unit, 1) : null;
  // Without a yield TPRS can't put a dish's share in count units, so it lists
  // no dishes even though recipes use the item.
  const noShare = l.flags.includes("no_yield")
    ? "until it has a yield"
    : l.flags.includes("recipe_unit_mismatch")
      ? "until the recipe's unit converts"
      : null;
  return (
    <details className={`lq-invd-line lq-fv-line${l.clean ? "" : " lq-fv-flagged"}`}>
      <summary>
        <div className="lq-invd-line-main">
          <span className="lq-invd-desc">
            {l.name}
            {l.band && l.band !== "normal" && <span className={`lq-fv-band lq-fv-band-${l.band}`}>{BAND_TEXT[l.band]}</span>}
          </span>
          <span className="lq-invd-amt" style={{ whiteSpace: "nowrap" }}>
            {l.clean && dollars ? <span className={dollars.className}>{dollars.text}</span> : <span className="lq-muted">left out</span>}
          </span>
        </div>
        <div className="lq-pw-sub lq-muted">
          used {l.used == null ? "—" : amount(l.used, l.unit)} · recipes say {l.theoretical == null ? "—" : num(l.theoretical)}
          {l.variance != null && ` · ${signed(l.variance)}`}
          {l.variancePct != null && ` (${signed(l.variancePct, 1)}%)`}
        </div>
        {!l.clean && <div className="lq-pw-sub lq-fv-why">Left out: {l.flags.map((f) => FLAG_TEXT[f] ?? f).join("; ")}</div>}
      </summary>
      <div className="lq-fv-detail">
        <div className="lq-muted">{movement(l)}</div>
        <div className="lq-muted">
          {l.costPerCountUnit != null ? `${usd(l.costPerCountUnit)} a ${unitLabel ?? "unit"}` : "no cost yet"}
          {l.yieldUsed != null && l.recipeUnit && ` · ${num(l.yieldUsed)} ${l.recipeUnit} a ${unitLabel ?? "unit"}`}
        </div>
        {l.caseSizeChanged && <div className="lq-muted">The case size changed, but both counts held the same amount a {unitLabel ?? "unit"}.</div>}
        {l.drivers.length > 0 ? (
          <>
            <div className="lq-fv-subhead">Behind “recipes say”</div>
            {l.drivers.map((d) => (
              <div key={d.label} className="lq-fv-driver">
                <span>
                  {d.label}
                  {d.estimate && <span className="lq-invd-tag lq-fv-estimate">estimate</span>}
                </span>
                <span>{num(d.units)}</span>
              </div>
            ))}
          </>
        ) : noShare ? (
          <div className="lq-muted">Recipes use it; their share can't be counted {noShare}.</div>
        ) : l.theoretical === 0 ? (
          <div className="lq-muted">Nothing sold in this bracket uses it.</div>
        ) : null}
      </div>
    </details>
  );
}

export function FoodVarianceReportView({
  report,
  basis,
  changes,
}: {
  report: FoodVarianceReportBody;
  basis: FoodVarianceBasis | null;
  /** Shown on a re-run: what it changed against the original. */
  changes?: FoodVersionChanges | null;
}) {
  const t = report.totals;
  const c = report.completeness;
  const net = overUnder(t.netVarianceDollars);
  const clean = report.lines.filter((l) => l.clean);
  const flagged = report.lines.filter((l) => !l.clean);
  const unconverted = basis?.purchases.unconverted ?? [];
  return (
    <div className="lq-fv-report">
      <div className="lq-pw-row">
        <div className="lq-fv-section-title">Net variance</div>
        <div className="lq-fv-net">
          <span className={net.className}>{net.text}</span>
          {t.variancePct != null && <span className="lq-muted lq-fv-net-pct"> {signed(t.variancePct, 1)}%</span>}
        </div>
        <div className="lq-pw-sub lq-muted">
          Used {usd(t.usedDollars)} · recipes say {usd(t.theoreticalDollars)} · {t.cleanLines} item{t.cleanLines === 1 ? "" : "s"} in the totals
          {t.flaggedLines > 0 && `, ${t.flaggedLines} left out`}
        </div>
      </div>

      <div className={`lq-pw-row${c.incomplete ? " lq-fv-incomplete" : ""}`}>
        <div className="lq-pw-sub">
          Food sales with a recipe: <strong>{c.mappedSalesPct == null ? "—" : `${c.mappedSalesPct}%`}</strong>
          {" · "}recipe dollars in the totals: <strong>{c.cleanTheoreticalPct == null ? "—" : `${c.cleanTheoreticalPct}%`}</strong>
        </div>
        {c.incomplete && (
          <div className="lq-pw-sub">
            Not the whole story yet: {c.reasons.join("; ")}. Some of what reads as loss may be a gap in the data.
          </div>
        )}
      </div>

      {changes && <ChangeList changes={changes} />}

      {report.caveats.length > 0 && (
        <div className="lq-fv-caveats">
          {report.caveats.map((cv, i) => (
            <div key={i} className="lq-pw-sub lq-muted">• {cv}</div>
          ))}
        </div>
      )}

      <p className="lq-section-label">Ingredients, biggest dollars first</p>
      {clean.length === 0 && <p className="lq-muted lq-fv-empty">No ingredient could be graded in this bracket.</p>}
      <div className="lq-invd-lines">
        {clean.map((l) => (
          <LineRow key={l.skuId} l={l} />
        ))}
      </div>

      {flagged.length > 0 && (
        <>
          <p className="lq-section-label">Left out of the totals</p>
          <div className="lq-invd-lines">
            {flagged.map((l) => (
              <LineRow key={l.skuId} l={l} />
            ))}
          </div>
        </>
      )}

      {report.noRecipe.length > 0 && (
        <>
          <p className="lq-section-label">Used, but no recipe uses them</p>
          <div className="lq-invd-lines">
            {report.noRecipe.map((n) => (
              <div key={n.skuId} className="lq-invd-line">
                <div className="lq-invd-line-main">
                  <span className="lq-invd-desc">{n.name}</span>
                  <span className="lq-invd-amt">{n.usedDollars == null ? "—" : usd(n.usedDollars)}</span>
                </div>
                <div className="lq-pw-sub lq-muted">used {n.used == null ? "—" : amount(n.used, n.unit)}</div>
              </div>
            ))}
          </div>
        </>
      )}

      {(unconverted.length > 0 || (basis?.purchases.unsettled ?? 0) > 0) && (
        <>
          <p className="lq-section-label">Deliveries not in these numbers</p>
          {(basis?.purchases.unsettled ?? 0) > 0 && (
            <p className="lq-muted lq-fv-empty">
              {basis!.purchases.unsettled} invoice{basis!.purchases.unsettled === 1 ? " was" : "s were"} still waiting on a review.
            </p>
          )}
          <div className="lq-invd-lines">
            {unconverted.map((u) => (
              <div key={u.skuId} className="lq-invd-line">
                <div className="lq-invd-line-main">
                  <span className="lq-invd-desc">{u.name}</span>
                  <span className="lq-invd-amt">{usd(u.dollars)}</span>
                </div>
                <div className="lq-pw-sub lq-muted">
                  {u.lines} line{u.lines === 1 ? "" : "s"} on {u.deliveries} deliver{u.deliveries === 1 ? "y" : "ies"} couldn't be converted to the count unit
                  {u.reasons.length > 0 && `: ${u.reasons.join("; ")}`}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
