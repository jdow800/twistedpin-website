import type { BottleSizeWarning } from "./api";

const size = (ml: number) => ml >= 1000 ? `${ml / 1000} L` : `${ml} ml`;

/** A question about the delivery evidence, never a proposed count correction. */
export function BottleSizeWarnings({ warnings }: { warnings: BottleSizeWarning[] }) {
  if (!warnings.length) return null;
  return (
    <section className="lq-precheck" aria-label="Check bottle sizes">
      {warnings.map((w) => (
        <div className="lq-precheck-row" key={w.skuId}>
          <span className="lq-precheck-name">Check bottle sizes: {w.name}</span>
          <span className="lq-precheck-detail">
            Latest delivery: {w.receivedQty} × {size(w.sizeMl)} on {new Date(w.receivedAt).toLocaleDateString("en-US", {
              month: "short", day: "numeric", timeZone: "America/Chicago",
            })}.
          </span>
          <span className="lq-precheck-detail">
            This count: {w.otherSizes.map((s) => `${s.counted} × ${size(s.sizeMl)}`).join(", ")};{" "}
            {w.counted == null ? `no entry for ${size(w.sizeMl)}` : `${w.counted} × ${size(w.sizeMl)}`}.
          </span>
          <span className="lq-precheck-why">
            Did some get counted under the other size, were the delivered bottles used up,
            or is the delivery record wrong? Check the labels and keep your count if it matches the shelf.
          </span>
        </div>
      ))}
    </section>
  );
}
