import type { BarSkuItem, InvoiceDetail, InvoiceLine, InvoiceSummary } from "./api";
import { currentCountDefinition, normalizeCountUnit } from "./count-definition";

export const reviewAnnotationFor = (line: InvoiceLine) =>
  line.reviewAnnotation === undefined ? line.annotation : line.reviewAnnotation;
export const reviewReasonsFor = (line: InvoiceLine) => line.reviewReasons ??
  (line.needsReview && line.lineType === "product" ? [line.matchedSkuId || line.nonInventory ? "amount" : "identity"] : []);
export const lineNeedsAnswer = (line: InvoiceLine) => !!line.costHoldReason || reviewReasonsFor(line).length > 0
  || (!!reviewAnnotationFor(line) && line.receivedQty == null)
  // Bought after it was discontinued (tprs 0196): asked, never held.
  || !!line.discontinued;
export const invoiceNeedsAttention = (invoice: InvoiceSummary) => invoice.needsAttention ?? (invoice.status !== "pending" &&
  (invoice.status === "flagged" || (!invoice.duplicateOf && !!(invoice.heldCount || invoice.reviewCount || invoice.unmatchedCount))));

export function detailNeedsAttention(detail: InvoiceDetail): boolean {
  const inv = detail.invoice;
  if (inv.status === "pending") return false;
  const openCopy = detail.copyReviews?.some(copy => !copy.reviewed && !copy.automaticallyReconciled) ?? false;
  if (inv.duplicateOf) {
    if (detail.copyReviews?.some(copy => copy.copyId === inv.id)) return openCopy;
    return !!(inv.reviewNotes ?? inv.handwrittenNotes ?? []).length
      || detail.lines.some(line => !!reviewAnnotationFor(line) && line.receivedQty == null);
  }
  return openCopy || inv.status === "flagged" || detail.lines.some(lineNeedsAnswer);
}

export function countUnitLabel(line: InvoiceLine, sku?: BarSkuItem): string {
  const definition = sku?.countUnit === line.matchedCountUnit ? currentCountDefinition(sku) : null;
  return definition?.unitLabel || (line.matchedCountUnit === "each" ? "item" : line.matchedCountUnit) || "unit";
}
const plurals: Record<string, string> = { each: "items", box: "boxes", bunch: "bunches", pouch: "pouches", lb: "lb" };
export const pluralUnit = (unit: string) => plurals[unit] ?? `${unit}s`;

/** A bounded convenience input, not an interpreter. Never infer a new physical
 * unit from prose: the named unit must be the existing inventory unit/label. */
export function parsePackageAnswer(text: string, unit: string): number | null {
  const value = text.trim().toLowerCase().replace(/[.!]$/, "").trim();
  let number: string | undefined;
  if (/^\d+$/.test(value)) number = value;
  else {
    const match = value.match(/^(?:1|one|a) case\s*(?:contains|has|holds|is|=|:)\s*(\d+)\s+([a-z]+)$/)
      ?? value.match(/^(\d+)\s+([a-z]+)(?:\s+(?:per|in (?:one|a|1)) case)?$/);
    if (!match || normalizeCountUnit(match[2]!) !== normalizeCountUnit(unit)
      && match[2] !== pluralUnit(unit)) return null;
    number = match[1];
  }
  const n = Number(number);
  return Number.isInteger(n) && n > 0 && n <= 100000 ? n : null;
}
