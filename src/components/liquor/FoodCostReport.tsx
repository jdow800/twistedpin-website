import type {
  FoodCostItem,
  FoodCostItemFlag,
  FoodCostLine,
  FoodCostLineKey,
  FoodCostReason,
  FoodCostReportBody,
} from "./api";
import { num, unitWord, usd } from "./FoodVarianceReport";

// One food bracket's cost of goods as TPRS stored it (migration 0206; Opsi
// BUILD-SPEC 11.125-11.127): opening value + purchases − closing value, by
// report line, against food + NA sales. Food and NA are one line, as history
// and Opsi report it; a USAR figure beside it takes comps and staff meals out
// at recipe cost. Anything the numbers can't stand behind yet is said in
// words, on the line it affects. Pure: the screen (views/FoodCost.tsx) loads
// the report and picks the version.

export const LINE_TITLE: Record<FoodCostLineKey, string> = {
  food_na: "Food + NA",
  paper: "Paper",
  supplies: "Supplies",
  bar_produce: "Bar produce on the food walk",
  unbucketed: "No report line yet",
};

const LINE_NOTE: Record<FoodCostLineKey, string> = {
  food_na: "Food and non-alcoholic drinks together, the way the books and Opsi read them.",
  paper: "No target; read per cover.",
  supplies: "Below the line: not cost of goods sold.",
  bar_produce: "Limes, lemons and the like, counted on the food walk. They belong with pour cost, never food.",
  unbucketed: "Counted, but nobody has said which line they belong on. Never read as food.",
};

/** Why an item is marked, in plain words. */
export const FLAG_TEXT: Record<FoodCostItemFlag, string> = {
  counted_one_end: "counted at only one end",
  unpriced: "no cost yet",
  negative_usage: "more at the end than the start plus deliveries",
  unit_switch: "counted in a different unit at each end",
  rebucketed: "moved to another line between the counts",
  cost_jump: "a cost more than 3× off: left out until revalued",
};

/** "$1,234.56", "−$12.00". */
export const money = (cents: number) => `${cents < 0 ? "−" : ""}${usd(cents / 100)}`;
export const pctText = (p: number | null) => (p == null ? "—" : `${p.toFixed(2)}%`);
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

function shortDate(iso: string): string {
  const d = new Date(`${iso.slice(0, 10)}T12:00:00`);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/** "a", "a and b", "a, b and 3 more". */
function list(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  if (names.length <= 3) return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
  return `${names.slice(0, 2).join(", ")} and ${names.length - 2} more`;
}

const REBATE_WHY: Record<string, string> = {
  no_document: "no Brunswick report",
  not_extracted: "the report isn't read yet",
  checksum_unknown: "the report's totals weren't checked",
  checksum_failed: "the report's totals didn't add up",
  not_captured: "read before rebates were captured",
};

function costPair(c: FoodCostItem["unitCost"]): string {
  const at = (n: number | null) => (n == null ? "—" : usd(n));
  if (c.purchased != null) return `paid ${at(c.purchased)}, counted at ${at(c.closing ?? c.opening)}`;
  return `${at(c.opening)} at the opening count, ${at(c.closing)} at the closing`;
}

/** A provisional reason, in words. */
export function reasonText(r: FoodCostReason): string {
  switch (r.code) {
    case "unpriced":
      return `No cost yet for ${list(r.items.map((i) => `${i.name} (${num(i.qty)} at the ${i.end} count)`))}. Left out of the dollars until priced.`;
    case "counted_one_end":
      return `Counted at only one end: ${list(r.items.map((i) => `${i.name} (not in the ${i.missing} count)`))}.`;
    case "cost_jump":
      return `A cost that looks wrong: ${list(r.items.map((i) => `${i.name}, ${costPair(i.unitCost)}`))}. Left out until revalued.`;
    case "estimated_purchases":
      return `${money(r.estimatedCents)} of ${money(r.goodsCents)} in purchases is the vendor-mix estimate, not matched lines.`;
    case "unbucketed":
      return "Items with no report line yet.";
    case "rebates_unknown": {
      const whys = [...new Set(r.dates.map((d) => REBATE_WHY[d.why] ?? d.why))];
      return `The rebate isn't known yet for ${list(r.dates.map((d) => shortDate(d.salesDate)))} (${whys.join("; ")}).`;
    }
    case "catering_pending":
      return `${plural(r.bookingIds.length, "catered event")} not completed yet: their food revenue lands when they are.`;
    case "pending_invoices":
      return `${plural(r.invoiceIds.length, "invoice")} not read yet: their dollars are missing.`;
    case "unattributed_purchases":
      return `${money(r.cents)} of purchases from a supplier with no category isn't on any line.`;
  }
}

/** Which way a percentage sits against the target: under it is good, past the
 *  band is a problem, between them is a watch. */
function pctClass(p: number | null, target: number, high: number): string {
  if (p == null) return "lq-muted";
  if (p <= target) return "lq-pw-down";
  return p > high ? "lq-pw-up" : "lq-fco-watch";
}

/** "10 bags", or a bare "10" when the report doesn't say what it was counted in. */
const qtyText = (n: number, unit: string | null | undefined) => (unit ? `${num(n)} ${unitWord(unit, n)}` : num(n));

/** One item's line: what was on the shelf, what came in, what's left, what went. */
export function itemMovement(i: FoodCostItem): string {
  const q = (n: number) => qtyText(n, i.unit);
  const end = (e: { qty: number | null; cents: number | null }) =>
    e.qty == null ? "not counted" : `${q(e.qty)}${e.cents == null ? " (no cost)" : `, ${money(e.cents)}`}`;
  const bought =
    i.purchased.qty === 0 && i.purchased.cents === 0
      ? "nothing"
      : `${i.purchased.qty == null ? "an amount that couldn't be converted" : q(i.purchased.qty)} for ${money(i.purchased.cents)}`;
  const parts = [`opened ${end(i.opening)}`, `bought ${bought}`, `closed ${end(i.closing)}`];
  if (i.usedQty != null) parts.push(`used ${q(i.usedQty)}`);
  if (i.usedCentsPerDay != null) parts.push(`${money(i.usedCentsPerDay)}/day`);
  return parts.join(" · ");
}

function ItemRow({ i }: { i: FoodCostItem }) {
  return (
    <div className={`lq-invd-line${i.excluded ? " lq-fv-flagged" : ""}`}>
      <div className="lq-invd-line-main">
        <span className="lq-invd-desc">{i.name}</span>
        <span className="lq-invd-amt">{i.excluded ? "left out" : i.usedCents == null ? "—" : money(i.usedCents)}</span>
      </div>
      <div className="lq-pw-sub lq-muted">{itemMovement(i)}</div>
      {i.flags.length > 0 && <div className="lq-pw-sub lq-fv-why">{i.flags.map((f) => FLAG_TEXT[f]).join("; ")}</div>}
    </div>
  );
}

function LineBlock({ line, report }: { line: FoodCostLine; report: FoodCostReportBody }) {
  const items = [...line.items].sort(
    (a, b) => Number(b.excluded) - Number(a.excluded) || Math.abs(b.usedCents ?? 0) - Math.abs(a.usedCents ?? 0) || a.name.localeCompare(b.name),
  );
  const buckets = Object.entries(line.byBucket);
  return (
    <details className={`lq-pw-row lq-fv-line lq-fco-line${line.reasons.length ? " lq-fv-incomplete" : ""}`}>
      <summary>
        <div className="lq-pw-head">
          <span className="lq-invrow-vendor">{LINE_TITLE[line.key]}</span>
          <span className="lq-fco-amt">{money(line.cogsCents)}</span>
        </div>
        <div className="lq-pw-sub lq-muted">
          {money(line.openingCents)} opening + {money(line.purchasesCents)} bought − {money(line.closingCents)} closing · {money(line.cogsPerDayCents)}/day
          {line.key === "paper" && report.paperPerCoverCents != null && ` · ${money(report.paperPerCoverCents)} per cover`}
        </div>
        {line.reasons.map((r, k) => (
          <div key={k} className="lq-pw-sub lq-fv-why">{reasonText(r)}</div>
        ))}
      </summary>
      <div className="lq-fv-detail">
        <div className="lq-muted">{LINE_NOTE[line.key]}</div>
        {buckets.length > 1 &&
          buckets.map(([bucket, t]) => (
            <div key={bucket} className="lq-fv-driver">
              <span>{bucket === "na_beverage" ? "NA drinks" : bucket === "food" ? "Food" : bucket}</span>
              <span>{money(t.cogsCents)}</span>
            </div>
          ))}
        {(line.purchases.freight !== 0 || line.purchases.discounts !== 0 || line.purchases.flaggedCents !== 0) && (
          <div className="lq-muted">
            Purchases include {money(line.purchases.freight)} freight and {money(line.purchases.discounts)} in on-invoice discounts
            {line.purchases.flaggedCents ? `; ${money(line.purchases.flaggedCents)} is on invoices not yet reviewed` : ""}.
          </div>
        )}
        {items.length === 0 ? (
          <div className="lq-muted">Nothing counted on this line.</div>
        ) : (
          <>
            <div className="lq-fv-subhead">Items, biggest dollars first</div>
            <div className="lq-invd-lines">
              {items.map((i) => (
                <ItemRow key={`${i.skuId}:${i.line}`} i={i} />
              ))}
            </div>
          </>
        )}
      </div>
    </details>
  );
}

export function FoodCostReportView({ report }: { report: FoodCostReportBody }) {
  const h = report.foodNa;
  const [low, high] = h.band;
  const lines = (["food_na", "paper", "supplies", "bar_produce", "unbucketed"] as const)
    .map((k) => report.lines[k])
    .filter((l) => l.key === "food_na" || l.key === "paper" || l.cogsCents !== 0 || l.items.length > 0 || l.reasons.length > 0);
  return (
    <div className="lq-fv-report lq-fco">
      <div className={`lq-pw-row${report.provisional ? " lq-fv-incomplete" : ""}`}>
        <div className="lq-fv-section-title">Food + NA cost</div>
        <div className="lq-fv-net">
          <span className={pctClass(h.pct, h.target, high)}>{pctText(h.pct)}</span>
          <span className="lq-muted lq-fv-net-pct"> target {h.target}% · band {low}–{high}%</span>
        </div>
        <div className="lq-pw-sub">
          {money(h.cogsAfterRebatesCents)} on {money(h.sales.totalCents)} of food + NA sales
        </div>
        <div className="lq-pw-sub lq-muted">
          {money(h.cogsBeforeRebatesCents)} before rebates{h.rebateCents !== 0 && ` · ${money(-h.rebateCents)} rebate`} · sales: GoTab{" "}
          {money(h.sales.gotabCents)}, catering {money(h.sales.cateringCents)}
          {h.sales.mocktailsOutCents !== 0 && ` · ${money(h.sales.mocktailsOutCents)} of mocktails go to pour cost`}
        </div>
        {h.sales.beside.length > 0 && (
          <div className="lq-pw-sub lq-muted">
            Not in sales (rung on the whole check): {h.sales.beside.map((b) => `${b.name} ${money(b.cents)}`).join(" · ")}
          </div>
        )}
        {report.provisional && (
          <div className="lq-pw-sub">
            <strong>Provisional.</strong> Some numbers below aren't final yet; each line says why. A new version is written on
            its own as the missing pieces arrive.
          </div>
        )}
      </div>

      {h.usar && (
        <div className="lq-pw-row">
          <div className="lq-fv-section-title">Without comps and staff meals</div>
          <div className="lq-fv-net-pct">
            <span className={pctClass(h.usar.pct, h.target, high)}>{pctText(h.usar.pct)}</span>
            <span className="lq-muted"> · {money(h.usar.cogsCents)}</span>
          </div>
          <div className="lq-pw-sub lq-muted">
            At recipe cost: staff meals {money(h.usar.staffMealsCents)} and staff or training comps{" "}
            {money(h.usar.staffTrainingCompsCents)} go to labor; guest comps {money(h.usar.guestRecoveryCompsCents)} go to
            marketing.
          </div>
          {h.usar.provisional && (
            <div className="lq-pw-sub lq-fv-why">
              Not every item could be costed: {list(h.usar.unvalued.map((u) => `${u.name} (${u.why})`))}.
            </div>
          )}
        </div>
      )}

      {report.reasons.map((r, k) => (
        <div key={k} className="lq-pw-row lq-fv-incomplete">
          <div className="lq-pw-sub">{reasonText(r)}</div>
        </div>
      ))}

      <p className="lq-section-label">By line · {plural(report.covers, "cover")} · {num(report.period.days)} days</p>
      {lines.map((l) => (
        <LineBlock key={l.key} line={l} report={report} />
      ))}

      {report.caveats.length > 0 && (
        <div className="lq-fv-caveats">
          {report.caveats.map((c, k) => (
            <div key={k} className="lq-pw-sub lq-muted">• {c}</div>
          ))}
        </div>
      )}
    </div>
  );
}
