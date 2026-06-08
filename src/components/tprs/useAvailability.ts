// Shared day-availability for the date strip + calendar modal. Resolves a
// representative "probe" product (the curated set on a curated page, else the
// first bookable product) and fetches per-month day-availability on demand,
// caching by month. Availability is boolean only (ADR-0025 AH-7). Past days are
// never selectable. One hook instance per date control; DateStrip creates it
// and hands the read fns to its CalendarModal so they share the cache.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  getBookableProducts,
  getProducts,
  getMonthAvailability,
} from "../../tprs/client";
import { todayIso, monthOf } from "./format";

export interface DayAvailability {
  /** Available iff the day is today-or-later AND (no probe OR in the loaded available set). */
  isAvailable: (isoDate: string) => boolean;
  /** The day's lowest slot price in cents (server-authoritative), or null. */
  priceFor: (isoDate: string) => number | null;
  /** Ask the hook to load a month's availability (idempotent; cached). */
  ensureMonth: (month: string) => void;
  /** True once a month's availability has loaded (so callers can wait on data). */
  isMonthLoaded: (month: string) => boolean;
  /** True while the probe product is still resolving. */
  loadingProbe: boolean;
}

/**
 * @param productCodes  the page's curated set — the probe is its first product.
 * @param productId     an EXPLICIT product to probe against. When set (e.g. the
 *   product-detail screen, where a specific product is chosen) it wins over the
 *   codes-probe, so the calendar's availability + per-day pricing reflect THAT
 *   product — not the first one on the page.
 */
export function useDayAvailability(
  productCodes?: number[],
  productId?: string,
): DayAvailability {
  const today = useMemo(todayIso, []);
  // undefined = resolving; null = no probe product; string = product id.
  const [probeId, setProbeId] = useState<string | null | undefined>(undefined);
  // month → Map of available date → priceCents (presence = available).
  const [months, setMonths] = useState<Record<string, Map<string, number | null>>>(
    {},
  );
  const requested = useRef<Set<string>>(new Set());

  // Resolve the probe product. An explicit productId is used directly (no
  // fetch); otherwise resolve the first product from the curated codes (or the
  // first bookable). Re-runs — and drops the month cache — whenever the probe
  // changes, so switching products repaints prices for the new product.
  useEffect(() => {
    if (productId) {
      setMonths({});
      requested.current = new Set();
      setProbeId(productId);
      return;
    }
    const ctrl = new AbortController();
    setProbeId(undefined);
    setMonths({});
    requested.current = new Set();
    const resolve =
      productCodes && productCodes.length > 0
        ? getProducts(productCodes, ctrl.signal).then((r) => r.products[0]?.id)
        : getBookableProducts(ctrl.signal).then(
            (r) => r.categories[0]?.products[0]?.id,
          );
    resolve
      .then((id) => setProbeId(id ?? null))
      .catch(() => {
        if (!ctrl.signal.aborted) setProbeId(null);
      });
    return () => ctrl.abort();
  }, [productCodes, productId]);

  const ensureMonth = useCallback(
    (month: string) => {
      if (!probeId) return; // undefined (loading) or null (no probe) → nothing to fetch
      if (requested.current.has(month)) return;
      requested.current.add(month);
      getMonthAvailabilitySafe(probeId, month)
        .then((map) => setMonths((prev) => ({ ...prev, [month]: map })))
        .catch(() => requested.current.delete(month));
    },
    [probeId],
  );

  const isAvailable = useCallback(
    (isoDate: string): boolean => {
      if (isoDate < today) return false;
      if (probeId === null) return true; // no probe → any future day is selectable
      const map = months[monthOf(isoDate)];
      if (!map) return true; // not loaded yet → optimistic; greys settle once loaded
      return map.has(isoDate);
    },
    [today, probeId, months],
  );

  const priceFor = useCallback(
    (isoDate: string): number | null => {
      const map = months[monthOf(isoDate)];
      if (!map) return null; // not loaded → no price until it arrives
      return map.get(isoDate) ?? null;
    },
    [months],
  );

  const isMonthLoaded = useCallback(
    (month: string): boolean => month in months,
    [months],
  );

  return {
    isAvailable,
    priceFor,
    ensureMonth,
    isMonthLoaded,
    loadingProbe: probeId === undefined,
  };
}

async function getMonthAvailabilitySafe(
  productId: string,
  month: string,
): Promise<Map<string, number | null>> {
  const days = await getMonthAvailability(productId, month);
  return new Map(
    days.filter((d) => d.available).map((d) => [d.date, d.priceCents]),
  );
}
