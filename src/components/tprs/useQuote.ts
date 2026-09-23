// Only a quote for the current request may authorize a displayed total or Pay.
// Invalidate synchronously on edits, including the debounce interval; failed
// pricing must never fall back to a coupon preview or a pretax charge.
import { useCallback, useEffect, useState } from "react";
import { getQuote, TprsApiError } from "../../tprs/client";
import { pointsRewardDetailsSchema, type QuoteRequest, type QuoteResponse } from "../../tprs/schemas";
import { pointsRewardMessage } from "./pointsRewardCopy";

export interface QuoteState {
  quote: QuoteResponse | null;
  loading: boolean;
  unavailable: boolean;
  error: string | null;
  retry: () => void;
}

function quoteErrorMessage(error: unknown): string {
  if (error instanceof TprsApiError) {
    const body = error.body as { code?: string } | undefined;
    if (body?.code === "loyalty_reward_rejected") {
      const details = pointsRewardDetailsSchema.safeParse(body);
      if (details.success) return pointsRewardMessage(details.data);
    }
    if (body?.code === "coupon_rejected") {
      return "That code couldn't be applied. Remove or change it at checkout.";
    }
  }
  return "We couldn't confirm your total. Try again before paying.";
}

export function useQuote(request: QuoteRequest | null): QuoteState {
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{
    key: string; quote: QuoteResponse | null; error: string | null; unavailable: boolean;
  } | null>(null);
  const retry = useCallback(() => setAttempt(n => n + 1), []);
  const key = request ? JSON.stringify([request, attempt]) : null;

  useEffect(() => {
    setResult(null);
    if (!key || !request) return;
    const ctrl = new AbortController();
    const timer = setTimeout(() => {
      getQuote(request, ctrl.signal)
        .then(quote => {
          if (!ctrl.signal.aborted) setResult({ key, quote, error: null, unavailable: false });
        })
        .catch(error => {
          if (!ctrl.signal.aborted) setResult({
            key, quote: null, error: quoteErrorMessage(error),
            unavailable: error instanceof TprsApiError && error.status === 404,
          });
        });
    }, 300);
    return () => { clearTimeout(timer); ctrl.abort(); };
    // Request identity is serialized so equivalent objects do not refetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const current = key !== null && result?.key === key ? result : null;
  return {
    quote: current?.quote ?? null,
    loading: key !== null && current === null,
    unavailable: current?.unavailable ?? false,
    error: current?.error ?? null,
    retry,
  };
}
