// Debounced, abortable server-authoritative quote (subtotal + tax + total).
// Calls POST /api/checkout/quote whenever the request changes by value (items /
// start time / coupon / tax-exempt), ~300ms debounced (it's a read-only
// preview). The previous quote stays visible while a new one is in flight (no
// flicker). `unavailable` flips true if the endpoint 404s — i.e. the backend
// hasn't shipped it yet — so the UI can fall back to the pre-tax display.

import { useEffect, useState } from "react";
import { getQuote, TprsApiError } from "../../tprs/client";
import type { QuoteRequest, QuoteResponse } from "../../tprs/schemas";

export interface QuoteState {
  quote: QuoteResponse | null;
  loading: boolean;
  /** The quote endpoint returned 404 — not live on the backend yet. */
  unavailable: boolean;
}

export function useQuote(request: QuoteRequest | null): QuoteState {
  const [quote, setQuote] = useState<QuoteResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [unavailable, setUnavailable] = useState(false);

  // Stable dep: changes only when the request changes by VALUE.
  const key = request ? JSON.stringify(request) : null;

  useEffect(() => {
    if (!key || !request) {
      setQuote(null);
      setLoading(false);
      setUnavailable(false);
      return;
    }
    const ctrl = new AbortController();
    setLoading(true);
    const t = setTimeout(() => {
      getQuote(request, ctrl.signal)
        .then((q) => {
          if (ctrl.signal.aborted) return;
          setQuote(q);
          setLoading(false);
          setUnavailable(false);
        })
        .catch((e) => {
          if (ctrl.signal.aborted) return;
          setLoading(false);
          setQuote(null);
          setUnavailable(e instanceof TprsApiError && e.status === 404);
        });
    }, 300);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
    // `request` is read from closure; `key` is its value-identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return { quote, loading, unavailable };
}
