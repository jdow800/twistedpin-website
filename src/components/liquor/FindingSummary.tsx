import type { PrecheckFinding } from "./api";
import { formatQty } from "./quantity";
import type { ReactNode } from "react";

/** Keep the decision and the count visible. The full server explanation is
 * available without making someone read it to keep walking the shelves. */
export default function FindingSummary({ finding: f, unit = "bottles", countDetails }: {
  finding: PrecheckFinding;
  unit?: string;
  countDetails?: ReactNode;
}) {
  const question: Record<PrecheckFinding["kind"], string> = {
    impossible: "Check the quantity or an unscanned delivery.",
    not_counted: "Still here? Count it, including zero if empty.",
    overuse: "Large stock drop. Sold or used, or a missed count?",
    zone_missed: `Stock moved or used? Check ${f.zoneName ?? "this shelf"}.`,
    first_count: "Older stock, or counted twice?",
    size_mixup: "Check bottle sizes and the delivery entry.",
    sibling_swap: "Check the labels on these two varieties.",
    big_loss: "Large gap after sales. Is all stock counted?",
    beer_not_counted: "Count bottled beer in Keg check.",
    batch_not_counted: "Count batch bottles. Enter zero if there are none.",
    zone_unexpected: `Keep ${f.zoneName ?? "this shelf"} on its usual count list?`,
    purchased_not_counted: "Delivered, but not counted. Count it, even if zero.",
    zone_members_uncounted: `Listed on ${f.zoneName ?? "this shelf"}, but not counted. Count it or enter zero.`,
  };
  // These findings are narrative-only: their numeric fields are placeholders.
  // Keep the actual evidence (including the missed shelf) visible.
  const narrativeOnly = ["big_loss", "sibling_swap", "zone_missed", "size_mixup", "zone_members_uncounted"].includes(f.kind);
  const hasHistory = !narrativeOnly && !["zone_unexpected", "zone_members_uncounted", "beer_not_counted", "batch_not_counted"].includes(f.kind);
  return (
    <div className="lq-finding-summary">
      <p className="lq-finding-question">{question[f.kind]}</p>
      {hasHistory && (
        <dl className="lq-finding-numbers" aria-label={`Quantity in ${unit}`}>
          <div><dt>Counted</dt><dd>{f.counted == null ? "Not counted" : formatQty(f.counted)}</dd></div>
          <div><dt>Last count</dt><dd>{formatQty(f.prior)}</dd></div>
          <div><dt>Delivered</dt><dd>{formatQty(f.purchased)}</dd></div>
        </dl>
      )}
      {hasHistory && <span className="lq-finding-unit">{unit}{f.unitsPerCase ? ` · ${formatQty(f.unitsPerCase)} per case` : ""}</span>}
      {narrativeOnly && <p className="lq-finding-evidence">{f.detail}</p>}
      {(!narrativeOnly || countDetails) && <details className="lq-finding-details">
        <summary>Details</summary>
        {!narrativeOnly && <p>{f.detail}</p>}
        {countDetails}
      </details>}
    </div>
  );
}
