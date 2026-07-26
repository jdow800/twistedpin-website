// Is the SMS-marketing opt-in reward still available to THIS guest?
//
// Drives one decision: whether the consent checkbox names a dollar amount or
// renders as the plain "Send me epic deals" box. A guest who already redeemed
// simply never sees the offer — no error, no "that code won't apply", nothing
// to phone the venue about. Suppression, not rejection.
//
// Mirrors useQuote's debounce + abort + value-key pattern rather than inventing
// a second async idiom in this codebase.

import { useEffect, useState } from "react";
import { previewOptInReward } from "../../tprs/client";
import type { CheckoutItem } from "../../tprs/schemas";

export interface OptInRewardState {
  /** Cents off when the reward is available to this guest; null = no offer. */
  amountCents: number | null;
}

export function useOptInReward(args: {
  items: CheckoutItem[];
  startTime: string | null;
  email: string;
  phone: string;
  /** False until BOTH contact fields are valid — see the gate below. */
  contactReady: boolean;
}): OptInRewardState {
  const [amountCents, setAmountCents] = useState<number | null>(null);

  // Value-identity key, same trick as useQuote: the effect re-runs only when
  // something that could change the answer actually changes.
  const key =
    args.contactReady && args.startTime && args.items.length > 0
      ? JSON.stringify({
          items: args.items,
          startTime: args.startTime,
          email: args.email.trim().toLowerCase(),
          phone: args.phone.trim(),
        })
      : null;

  useEffect(() => {
    if (!key) {
      setAmountCents(null);
      return;
    }
    const controller = new AbortController();
    // 400ms — slightly longer than useQuote's 300ms because this fires off
    // contact fields, and a guest correcting a typo mid-email would otherwise
    // spray requests. Nothing visible depends on it landing fast.
    const timer = setTimeout(() => {
      const req = JSON.parse(key) as {
        items: CheckoutItem[];
        startTime: string;
        email: string;
        phone: string;
      };
      void previewOptInReward(req, controller.signal).then((res) => {
        if (controller.signal.aborted) return;
        // previewOptInReward never throws — it resolves { available:false } on
        // any failure, including a backend that doesn't have the endpoint yet.
        // So the offer silently degrades to "not available" and the guest sees
        // the plain opt-in box. Deploy-order-safe by construction.
        setAmountCents(res.available ? res.amountCents : null);
      });
    }, 400);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [key]);

  return { amountCents };
}
