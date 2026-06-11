// Shared day-availability for the date strip + calendar modal. Resolves the
// probe set — the EXPLICIT product on the detail screen, or ALL of a curated
// page's products on the main screen — and fetches per-month day-availability
// on demand, caching by (product, month). On the main screen the days are a
// UNION: a day is open if ANY of the page's products is bookable that day
// (probing only the first product greyed Wed–Fri whenever product #1 happened
// to be weekend-only, even though the 2-hour lanes were wide open — the
// "everything's greyed out" landing bug). Calendar prices on the main screen
// are therefore the LOWEST across products — a "from" price, matching the
// cards. Availability is boolean per day (ADR-0025 AH-7); past days are never
// selectable. One hook instance per date control; DateStrip creates it and
// hands the read fns to its CalendarModal so they share the cache.

import { useCallback, useEffect, useRef, useState, useMemo } from "react";
import {
  getBookableProducts,
  getProducts,
  getMonthAvailability,
  getAvailability,
} from "../../tprs/client";
import type { AvailabilitySlot } from "../../tprs/schemas";
import { todayIso, monthOf, shiftMonth } from "./format";

// ── Module-level availability cache ──────────────────────────────────────────
// Shared across every hook instance and surviving DetailStep unmount/remount.
// The backend availability compute is the slow path — so this cache is the
// difference between "instant on re-entry" and "re-pay the compute" when the
// guest backs out and re-picks a product, or when the main + detail date strips
// probe the same product. Short TTL because a concurrent booking can change
// availability; the cart-hold re-validates server-side at checkout regardless.
// `monthInflight` coalesces duplicate concurrent fetches into a single request.
const MONTH_TTL_MS = 90_000;
type MonthMap = Map<string, number | null>; // available date → priceCents
const monthCache = new Map<string, { at: number; map: MonthMap }>();
const monthInflight = new Map<string, Promise<MonthMap>>();

function loadMonth(productId: string, month: string): Promise<MonthMap> {
  const key = `${productId}:${month}`;
  const hit = monthCache.get(key);
  if (hit && Date.now() - hit.at < MONTH_TTL_MS) return Promise.resolve(hit.map);
  const existing = monthInflight.get(key);
  if (existing) return existing;
  const p = getMonthAvailability(productId, month)
    .then((days) => {
      const map: MonthMap = new Map(
        days.filter((d) => d.available).map((d) => [d.date, d.priceCents]),
      );
      monthCache.set(key, { at: Date.now(), map });
      return map;
    })
    .finally(() => monthInflight.delete(key));
  monthInflight.set(key, p);
  return p;
}

// ── Day-slot cache (the detail screen's time grid + prefetch) ────────────────
// Same shape as the month cache above, for GET /api/availability (per-slot
// times for one product+date). The browser's HTTP cache already covers exact
// repeats (the API sends max-age=30 + stale-while-revalidate, and the proxy
// forwards it) — what it does NOT give us is coalescing: a guest's click must
// JOIN an in-flight prefetch instead of racing a duplicate request. That's
// `slotsInflight`. First views are the slow path (~0.5s through the proxy);
// the prefetchers in MainStep/DetailStep warm them via this loader.
const SLOTS_TTL_MS = 90_000;
const slotsCache = new Map<string, { at: number; slots: AvailabilitySlot[] }>();
const slotsInflight = new Map<string, Promise<AvailabilitySlot[]>>();

export function loadDaySlots(
  productId: string,
  date: string,
): Promise<AvailabilitySlot[]> {
  const key = `${productId}:${date}`;
  const hit = slotsCache.get(key);
  if (hit && Date.now() - hit.at < SLOTS_TTL_MS) {
    return Promise.resolve(hit.slots);
  }
  const existing = slotsInflight.get(key);
  if (existing) return existing;
  const p = getAvailability(productId, date)
    .then((slots) => {
      slotsCache.set(key, { at: Date.now(), slots });
      return slots;
    })
    .finally(() => slotsInflight.delete(key));
  slotsInflight.set(key, p);
  return p;
}

export interface DayAvailability {
  /** Open iff today-or-later AND (no probe OR ANY probed product has the day). */
  isAvailable: (isoDate: string) => boolean;
  /** True while the date's verdict is still loading (probe resolving, or its
   *  month not fully fetched and no product has shown the day open yet) —
   *  render "checking…" instead of optimistic-available so a chip/cell never
   *  flips open→greyed when the compute lands. */
  isPending: (isoDate: string) => boolean;
  /** The day's lowest slot price in cents across the probed products (exact on
   *  the single-product detail screen; a "from" price on the main screen). */
  priceFor: (isoDate: string) => number | null;
  /** ONE product's verdict for a date — true/false once that product's month
   *  has loaded, undefined while in flight. The curated landing uses this to
   *  scope the product grid to what's actually bookable on the selected day
   *  (the backend's day flag is time-of-day aware, so "no remaining times
   *  today" reads false). */
  isProductAvailable: (
    productId: string,
    isoDate: string,
  ) => boolean | undefined;
  /** ONE product's first open day on/after `fromIso`, scanning LOADED months
   *  only (never fetches) — null when unknown. Feeds the "Next: Saturday,
   *  June 13" hint on products hidden for the selected day. */
  nextOpenFor: (productId: string, fromIso: string) => string | null;
  /** ONE product's lowest slot price (cents) for a date — null while loading or
   *  when the day isn't open for it. Party-size mode multiplies this by the
   *  computed lane count for the group "from" total. */
  productPriceFor: (productId: string, isoDate: string) => number | null;
  /** Ask the hook to load a month's availability (idempotent; cached). */
  ensureMonth: (month: string) => void;
  /** True once EVERY probed product's availability for the month has loaded. */
  isMonthLoaded: (month: string) => boolean;
  /** True while the probe set is still resolving. */
  loadingProbe: boolean;
}

/**
 * @param productCodes  the page's curated set — ALL its products are probed
 *   (union) so the main screen's days reflect the whole page, not product #1.
 * @param productId     an EXPLICIT product to probe (the detail screen). Wins
 *   over the codes-probe, so the calendar's availability + per-day pricing
 *   reflect THAT product alone.
 */
export function useDayAvailability(
  productCodes?: number[],
  productId?: string,
): DayAvailability {
  const today = useMemo(todayIso, []);
  // undefined = resolving; null = no probe (any day selectable); string[] = ids.
  const [probeIds, setProbeIds] = useState<string[] | null | undefined>(undefined);
  // month → productId → (available date → priceCents).
  const [months, setMonths] = useState<
    Record<string, Record<string, MonthMap>>
  >({});
  const requested = useRef<Set<string>>(new Set());

  // Resolve the probe set. An explicit productId is used directly (no fetch);
  // otherwise ALL the curated codes' products (or, on the generic catalog page,
  // just the first bookable — a full-catalog union would fan out a fetch per
  // product for a page that isn't customer-facing). Re-runs — and drops the
  // hook's month state — whenever the probe changes.
  useEffect(() => {
    if (productId) {
      setMonths({});
      requested.current = new Set();
      setProbeIds([productId]);
      return;
    }
    const ctrl = new AbortController();
    setProbeIds(undefined);
    setMonths({});
    requested.current = new Set();
    const resolve =
      productCodes && productCodes.length > 0
        ? getProducts(productCodes, ctrl.signal).then((r) =>
            r.products.map((p) => p.id),
          )
        : getBookableProducts(ctrl.signal).then((r) => {
            const first = r.categories[0]?.products[0]?.id;
            return first ? [first] : [];
          });
    resolve
      .then((ids) => setProbeIds(ids.length > 0 ? ids : null))
      .catch(() => {
        if (!ctrl.signal.aborted) setProbeIds(null);
      });
    return () => ctrl.abort();
  }, [productCodes, productId]);

  const ensureMonth = useCallback(
    (month: string) => {
      if (!probeIds) return; // undefined (loading) or null (no probe)
      for (const pid of probeIds) {
        const key = `${pid}:${month}`;
        if (requested.current.has(key)) continue;
        requested.current.add(key);
        loadMonth(pid, month)
          .then((map) =>
            setMonths((prev) => ({
              ...prev,
              [month]: { ...prev[month], [pid]: map },
            })),
          )
          .catch(() => requested.current.delete(key));
      }
    },
    [probeIds],
  );

  const isAvailable = useCallback(
    (isoDate: string): boolean => {
      if (isoDate < today) return false;
      if (probeIds === null) return true; // no probe → any future day selectable
      const byPid = months[monthOf(isoDate)];
      if (!byPid) return false; // nothing loaded → isPending carries the wait
      for (const pid in byPid) if (byPid[pid].has(isoDate)) return true;
      return false;
    },
    [today, probeIds, months],
  );

  const isPending = useCallback(
    (isoDate: string): boolean => {
      if (isoDate < today) return false; // past → just unavailable
      if (probeIds === undefined) return true; // probe still resolving
      if (probeIds === null) return false; // no probe → freely selectable
      const byPid = months[monthOf(isoDate)];
      if (byPid) {
        // The moment ANY product shows the day open it stops being pending —
        // progressive reveal; "unavailable" needs every product's verdict.
        for (const pid in byPid) if (byPid[pid].has(isoDate)) return false;
      }
      return !probeIds.every((pid) => byPid?.[pid]);
    },
    [today, probeIds, months],
  );

  const isProductAvailable = useCallback(
    (pid: string, isoDate: string): boolean | undefined => {
      if (isoDate < today) return false;
      if (probeIds === null) return true; // no probe → never gate the grid
      const map = months[monthOf(isoDate)]?.[pid];
      if (!map) return undefined; // verdict still loading
      return map.has(isoDate);
    },
    [today, probeIds, months],
  );

  const nextOpenFor = useCallback(
    (pid: string, fromIso: string): string | null => {
      const start = fromIso < today ? today : fromIso;
      let m = monthOf(start);
      for (let i = 0; i < 3; i++, m = shiftMonth(m, 1)) {
        const map = months[m]?.[pid];
        if (!map) return null; // not loaded → unknown (no fetching here)
        const dates = [...map.keys()].sort();
        for (const d of dates) if (d >= start) return d;
      }
      return null;
    },
    [today, months],
  );

  const productPriceFor = useCallback(
    (pid: string, isoDate: string): number | null => {
      const v = months[monthOf(isoDate)]?.[pid]?.get(isoDate);
      return typeof v === "number" ? v : null;
    },
    [months],
  );

  const priceFor = useCallback(
    (isoDate: string): number | null => {
      const byPid = months[monthOf(isoDate)];
      if (!byPid) return null;
      let min: number | null = null;
      for (const pid in byPid) {
        const v = byPid[pid].get(isoDate);
        if (typeof v === "number" && (min === null || v < min)) min = v;
      }
      return min;
    },
    [months],
  );

  const isMonthLoaded = useCallback(
    (month: string): boolean =>
      Array.isArray(probeIds) &&
      probeIds.every((pid) => !!months[month]?.[pid]),
    [probeIds, months],
  );

  return {
    isAvailable,
    isPending,
    isProductAvailable,
    nextOpenFor,
    productPriceFor,
    priceFor,
    ensureMonth,
    isMonthLoaded,
    loadingProbe: probeIds === undefined,
  };
}
