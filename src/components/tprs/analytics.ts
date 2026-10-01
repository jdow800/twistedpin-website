// GA4 events for the booking flow. gtag() is stubbed synchronously in
// Base.astro (see ConfirmationStep's purchase event); when it's missing
// (ad blockers, local dev) every call is a no-op. Aggregates only — never send
// guest names, emails or phone numbers.

type Gtag = (...args: unknown[]) => void;

export function track(event: string, params: Record<string, unknown>): void {
  if (typeof window === "undefined") return;
  const gtag = (window as unknown as { gtag?: Gtag }).gtag;
  if (typeof gtag === "function") gtag("event", event, params);
}

/** GA4 `items` entry for an add-on (price in dollars). */
export function addOnItem(code: number, name: string, priceCents: number, quantity = 1) {
  return { item_id: String(code), item_name: name, price: priceCents / 100, quantity };
}
