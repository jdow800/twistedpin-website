export const prerender = false;

import type { APIRoute } from 'astro';

/**
 * /api/coupon-signup — server-side intake proxy for the loyalty $10 signup
 * form (the native form on /coupon; promoted from /coupon-preview at the
 * 2026-07-24 loyalty cutover).
 *
 * Per Loyalty/docs/coupon-page-intake-spec.md, the page collects the form
 * and POSTs to ONE loyalty endpoint; all loyalty logic (create customer,
 * grant the $10, send the welcome text, enforce first-join) is server-side
 * in n8n (`WF-Loyalty-Forms-Intake`). We post from the server (not the
 * browser) so we can attach IP/User-Agent for TCPA consent evidence and
 * keep the call off the public client (spec §1), and to dodge browser CORS.
 *
 * The trusted, non-user fields (source_channel / form_slug / offer_slug)
 * are set HERE, not trusted from the client. We relay n8n's JSON response
 * verbatim so the page can branch on `ok` / `first_join` / `reason`.
 *
 * Override the endpoint in non-prod via LOYALTY_INTAKE_URL if ever needed.
 */
const INTAKE_URL =
  import.meta.env.LOYALTY_INTAKE_URL ??
  'https://n8n.twistedpin.com/webhook/loyalty/forms/intake';

export const POST: APIRoute = async ({ request, clientAddress }) => {
  let input: Record<string, unknown>;
  try {
    input = await request.json();
  } catch {
    return json({ ok: false, reason: 'bad_request' }, 400);
  }

  // IP/User-Agent for consent evidence (spec §2). clientAddress is Vercel's
  // resolved client IP; fall back to the forwarded header if unset.
  const ip =
    clientAddress ||
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    null;
  const userAgent = request.headers.get('user-agent') ?? null;

  // Build the loyalty payload. Trusted fields are set server-side; the rest
  // pass through from the form. n8n normalizes the phone + validates.
  const payload = {
    source_channel: 'web_form',
    form_slug: 'signup-10off',
    offer_slug: 'signup-10off',
    phone: input.phone ?? null,
    first_name: input.first_name ?? null,
    last_name: input.last_name ?? null,
    email: input.email ?? null,
    consent_marketing: input.consent_marketing === true,
    phone_type: input.phone_type ?? null, // 'mobile'|'landline'|'voip' from Twilio Lookup (db/026)
    birthday_month: input.birthday_month ?? null,
    birthday_day: input.birthday_day ?? null,
    submission_id: input.submission_id ?? null,
    consent_language: input.consent_language ?? null,
    page_url: input.page_url ?? null,
    website_url: input.website_url ?? '', // honeypot
    ip,
    user_agent: userAgent,
  };

  try {
    const upstream = await fetch(INTAKE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    // Relay the loyalty response verbatim. If n8n ever returns non-JSON
    // (e.g. a 5xx HTML page), surface a generic error the page can show.
    const text = await upstream.text();
    try {
      const data = JSON.parse(text);
      return json(data, 200);
    } catch {
      return json({ ok: false, reason: 'upstream_error' }, 200);
    }
  } catch {
    // n8n unreachable / network failure.
    return json({ ok: false, reason: 'network_error' }, 200);
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
