/** Counting quantities: retain saved thousandths, without floating-point noise. */
export function roundQty(value: number): number {
  return Math.round(value * 1000) / 1000;
}

const quantityFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 3,
  useGrouping: false,
});

/** Display only. Calculations and saved provenance retain their numeric values. */
export function formatQty(value: number | string | null | undefined): string {
  const number = value == null ? 0 : Number(value);
  if (!Number.isFinite(number)) return "—";
  return quantityFormatter.format(number);
}
