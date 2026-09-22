import type { BarSkuItem } from "./api";

// Invoice search has its own catalog and text matching. Count screens continue
// using their section-specific catalog and voice matcher.
const key = (text: string) => text.toLowerCase().replace(/(.)\1+/g, "$1").replace(/[^a-z0-9]+/g, " ").trim();

export function searchInvoiceItems(query: string, catalog: BarSkuItem[]): BarSkuItem[] {
  const tokens = key(query).split(/\s+/).filter(Boolean);
  if (!tokens.length) return [];
  return catalog.filter(item => tokens.every(token => key(item.name).includes(token))).slice(0, 8);
}

export function invoiceItemLabel(item: BarSkuItem): string {
  const section = item.section === "food" ? "Food inventory" : "Liquor inventory";
  return `${item.name}${item.sizeMl != null ? ` · ${item.sizeMl}ml` : ""} · ${section}`;
}
