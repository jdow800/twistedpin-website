export const prerender = false;

import type { APIRoute } from 'astro';

/**
 * /api/phone-verify — live mobile-number check for the $10 signup form.
 *
 * The browser can't call Twilio directly (would leak the auth token), so the
 * coupon page pings this endpoint as the user finishes the phone field. We
 * run Twilio Lookup v2 with the Line Type Intelligence package (the cheap
 * data add-on, ~$0.008/lookup, that returns type: mobile|landline|voip|…)
 * and reply with { textable, line_type } so the field can error/shake on a
 * non-textable number before submit. The resolved line type is also passed
 * to the loyalty intake as `phone_type` (persists on customer.phone_type,
 * per Loyalty db/026).
 *
 * FAIL-OPEN BY DESIGN: if the Twilio creds aren't set, or Twilio errors /
 * times out, we return textable:true so a real customer is NEVER blocked by
 * a verifier hiccup. We only return textable:false on a CONFIRMED bad result
 * (invalid number or a landline). Set TWILIO_ACCOUNT_SID + TWILIO_AUTH_TOKEN
 * on Vercel to activate; until then this no-ops (status:"unconfigured").
 */
const SID = import.meta.env.TWILIO_ACCOUNT_SID;
const TOKEN = import.meta.env.TWILIO_AUTH_TOKEN;

// Map Twilio's line_type_intelligence.type → the loyalty phone_type enum.
function normalizeType(t: string | null | undefined): string | null {
  if (!t) return null;
  const low = t.toLowerCase();
  if (low === 'mobile') return 'mobile';
  if (low === 'landline') return 'landline';
  if (low.includes('voip')) return 'voip';
  return null; // tollFree / unknown / etc. — leave unset
}

export const POST: APIRoute = async ({ request }) => {
  let phone: string | undefined;
  try {
    ({ phone } = await request.json());
  } catch {
    return json({ ok: false, reason: 'bad_request' }, 400);
  }

  // Normalize to 10 US digits (drop a leading country 1).
  let digits = String(phone ?? '').replace(/\D/g, '');
  if (digits.length === 11 && digits[0] === '1') digits = digits.slice(1);
  if (digits.length !== 10) {
    return json({ ok: true, status: 'invalid_format', textable: false, line_type: null }, 200);
  }
  const e164 = '+1' + digits;

  // Not configured → fail open (no-op). Form behaves exactly as without the
  // verifier until creds are added.
  if (!SID || !TOKEN) {
    return json({ ok: true, status: 'unconfigured', textable: true, line_type: null }, 200);
  }

  try {
    const url =
      `https://lookups.twilio.com/v2/PhoneNumbers/${encodeURIComponent(e164)}` +
      `?Fields=line_type_intelligence`;
    const auth = Buffer.from(`${SID}:${TOKEN}`).toString('base64');
    const res = await fetch(url, {
      headers: { Authorization: `Basic ${auth}` },
      signal: AbortSignal.timeout(4000),
    });

    // 404 = Twilio couldn't find/parse the number → treat as not textable.
    if (res.status === 404) {
      return json({ ok: true, status: 'not_found', textable: false, line_type: null }, 200);
    }
    // Any other non-2xx → transient; fail open.
    if (!res.ok) {
      return json({ ok: true, status: 'lookup_error', textable: true, line_type: null }, 200);
    }

    const data: any = await res.json();
    const lineType = normalizeType(data?.line_type_intelligence?.type);
    // Block only on a CONFIRMED problem: Twilio says invalid, or it's a
    // landline. Mobile / VoIP / unknown all pass (VoIP usually texts fine;
    // unknown fails open so we don't reject real mobiles).
    const textable = data?.valid !== false && lineType !== 'landline';

    return json(
      { ok: true, status: textable ? 'ok' : 'not_textable', textable, line_type: lineType },
      200,
    );
  } catch {
    // Network error / timeout → fail open.
    return json({ ok: true, status: 'lookup_error', textable: true, line_type: null }, 200);
  }
};

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      'X-Robots-Tag': 'noindex, nofollow',
    },
  });
}
